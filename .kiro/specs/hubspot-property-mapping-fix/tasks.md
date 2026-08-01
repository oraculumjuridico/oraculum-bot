# Implementation Plan

## Fase 1: revisão da especificação

- [ ] 1. Revisar e alinhar a especificação aos módulos existentes
  - Confirmar que o escopo permanece restrito a src/domain/hubspot-core.js, montarPropsContatoHubSpot, src/domain/single-case-contact-reconciliation.js, reconcileSingleCaseContactCheckpoint e o fluxo existente de single-case-apply.js.
  - Remover qualquer proposta de criação de src/domain/hubspot-property-mapper.js ou src/domain/contact-reconciliation.js.
  - Garantir que a reconciliação continue antes da criação e não seja movida para contacts.create.
  - _Requisitos: reconciliação existente, módulos autorizados_

- [ ] 2. Atualizar os requisitos de telefone, CPF e placeholders
  - Documentar a regra de telefone: celular brasileiro com código do país pode ter 13 dígitos; telefone fixo com código do país pode ter 12 dígitos; preservar todos os dígitos válidos; não inventar nem remover dígitos; preservar o nono dígito do celular.
  - Documentar a regra de CPF: vazio omite; válido envia; inválido rejeita; placeholder rejeita; ausência não apaga valor existente.
  - Documentar a validação de placeholders em coleta, revisão, confirmação, invariantes, montagem de props, contrato HubSpot, criação e atualização.
  - _Requisitos: telefone, CPF, placeholders_

## Fase 2: contrato de sucesso e logs

- [ ] 3. Definir o contrato de sucesso
  - Exigir numeroCaso, contactId/contatoId, dealId/negocioId e caseFolderId/pastaDriveId antes de exibir “Caso criado com sucesso”.
  - Preservar FALLBACK_BLOCKED_PARTIAL_WRITES, IDs parciais, retomada idempotente e PRs #10/#11.
  - _Requisitos: contrato de sucesso_

- [ ] 4. Definir a política de logs
  - Normalizar contactId/contatoId, dealId/negocioId e caseFolderId/pastaDriveId.
  - Registrar somente dados técnicos: numeroCaso, etapa, operação, resultado e presença de recursos.
  - Nunca registrar CPF, telefone completo, e-mail, nome, relato, documentos, senhas ou credenciais.
  - _Requisitos: sanitização de logs_

## Fase 3: validação documental

- [ ] 5. Validar o escopo documental
  - Confirmar que não há propostas para documentos pelo WhatsApp, mídia, menus, melhorias visuais, templates Meta, reengajamento ou npm audit fix.
  - Confirmar que a especificação não pede expansão de contacts.update e não introduz soluções fora do escopo.
  - _Requisitos: fora do escopo_

- [ ] 6. Validar ocorrências proibidas
  - Verificar que não existam ocorrências de:
    - hubspot-property-mapper.js
    - src/domain/contact-reconciliation.js
    - always returns full 13 digits
    - reconciliação dentro de contacts.create
    - expansão de contacts.update
  - _Requisitos: verificação final da especificação_

## Fase 4: entrega documental

- [ ] 7. Consolidar a revisão final
  - Salvar a versão final dos três arquivos na pasta da especificação.
  - Reabrir os arquivos para confirmar que o conteúdo está consistente e restrito à pasta da especificação.
  - _Requisitos: revisão final e re-leitura_
