# Bugfix Requirements Document

## Escopo

Este documento ajusta somente o requisito da especificação para o fluxo de HubSpot/admin-assisted. Não há implementação de código nesta etapa.

### Módulos autorizados

- src/domain/hubspot-core.js
- função montarPropsContatoHubSpot
- src/domain/single-case-contact-reconciliation.js
- função reconcileSingleCaseContactCheckpoint
- fluxo existente de single-case-apply.js

### Módulos e caminhos proibidos

Não criar nem propor criação de:

- src/domain/hubspot-property-mapper.js
- src/domain/contact-reconciliation.js

## Requisitos corretos

### 1. Reconciliação

- A reconciliação deve permanecer antes da criação, na camada de domínio e no fluxo existente de single-case-apply.js.
- Não deve existir proposta de reconciliação dentro de contacts.create.
- A regra de reconciliação deve usar o fluxo existente de single-case-contact-reconciliation.js e a função reconcileSingleCaseContactCheckpoint.

### 2. Telefone

- Celular brasileiro válido com código do país pode ter 13 dígitos.
- Telefone fixo brasileiro válido com código do país pode ter 12 dígitos.
- Preservar todos os dígitos válidos.
- Não inventar nem remover dígitos.
- Preservar o nono dígito do celular.
- Busca, criação e atualização no HubSpot devem usar a mesma forma canônica.
- A normalização da Meta deve permanecer separada.

### 3. CPF

- Vazio: omitir.
- Válido: enviar.
- Inválido: rejeitar.
- Placeholder: rejeitar.
- Ausência: não apagar valor existente.
- Remover qualquer requisito de tratar CPF vazio como falha.

### 4. Placeholders

A validação de placeholders deve ser planejada em todos os pontos relevantes:

- coleta;
- revisão;
- confirmação;
- invariantes;
- montarPropsContatoHubSpot;
- contrato HubSpot;
- criação;
- atualização.

Placeholders não podem aparecer como confirmados, servir como identidade, chegar ao HubSpot ou apagar dados válidos.

### 5. Contrato de sucesso

Antes de mostrar “Caso criado com sucesso”, exigir estes identificadores:

- numeroCaso;
- contactId ou contatoId;
- dealId ou negocioId;
- caseFolderId ou pastaDriveId.

Preservar:

- FALLBACK_BLOCKED_PARTIAL_WRITES;
- IDs parciais;
- retomada idempotente;
- PRs #10 e #11.

### 6. Logs

Os requisitos de logs devem incluir normalização de:

- contactId/contatoId;
- dealId/negocioId;
- caseFolderId/pastaDriveId.

Registrar somente dados técnicos, como:

- numeroCaso;
- etapa;
- operação;
- resultado;
- presença de recursos.

Nunca registrar:

- CPF;
- telefone completo;
- e-mail;
- nome;
- relato;
- documentos;
- senhas;
- credenciais.

### 7. Fora do escopo

- documentos pelo WhatsApp;
- processamento de mídia;
- menus;
- melhorias visuais;
- templates Meta;
- reengajamento;
- npm audit fix.

## Critério de aceite

A especificação deverá refletir exatamente estas diretrizes e não propor soluções fora do escopo ou fora dos módulos já existentes.
